#!/usr/bin/env bash
# =============================================================================
# FocusFlow — Assignment 4: deploy to Google Cloud
#   Cloud Run (client + server) -> Serverless NEGs -> HTTPS Load Balancer
#   -> your domain + Google-managed certificate. Secrets in Secret Manager.
#
# Recommended: run in Google Cloud Shell (it already has gcloud and is logged in).
#   1. Upload this file to Cloud Shell (or git clone the repo there).
#   2. Edit the 4 variables below (PROJECT_ID, DOMAIN, ...).
#   3. bash deploy-gcp.sh
#
# The script is idempotent-ish: re-running skips resources that already exist,
# and re-deploys the Cloud Run services (use that after pushing new images).
# =============================================================================
set -euo pipefail

# ---------- EDIT THESE ----------
PROJECT_ID="${PROJECT_ID:-YOUR-GCP-PROJECT-ID}"
DOMAIN="${DOMAIN:-YOUR-NAME.ddns.net}"          # hostname only, no https://
REGION="${REGION:-me-west1}"                     # Tel Aviv. europe-west1 also fine.
DOCKERHUB_USER="${DOCKERHUB_USER:-malkamalk}"
MIN_INSTANCES="${MIN_INSTANCES:-2}"              # assignment: at least 2 behind the LB
MAX_INSTANCES="${MAX_INSTANCES:-4}"
# --------------------------------

CLIENT_SVC="focusflow-client"
SERVER_SVC="focusflow-server"
SECRET_MONGO="focusflow-mongodb-url"
SECRET_JWT="focusflow-jwt-secret"

if [[ "$PROJECT_ID" == YOUR-* || "$DOMAIN" == YOUR-* ]]; then
  echo "ERROR: edit PROJECT_ID and DOMAIN at the top of this script first." >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID" >/dev/null
exists() { "$@" >/dev/null 2>&1; }

echo "=== 1. Enabling APIs"
gcloud services enable run.googleapis.com compute.googleapis.com secretmanager.googleapis.com

echo "=== 2. Secrets (Secret Manager) — values are never written to disk or code"
if ! exists gcloud secrets describe "$SECRET_MONGO"; then
  echo "Paste your MongoDB Atlas connection string (mongodb+srv://...); input is hidden:"
  read -rs MONGO_URL; echo
  printf '%s' "$MONGO_URL" | gcloud secrets create "$SECRET_MONGO" --data-file=- --replication-policy=automatic
  unset MONGO_URL
else
  echo "  $SECRET_MONGO already exists (to change it: gcloud secrets versions add $SECRET_MONGO --data-file=-)"
fi
if ! exists gcloud secrets describe "$SECRET_JWT"; then
  # Random 64-char key, piped straight into Secret Manager.
  openssl rand -hex 32 | tr -d '\n' | gcloud secrets create "$SECRET_JWT" --data-file=- --replication-policy=automatic
else
  echo "  $SECRET_JWT already exists"
fi

echo "=== 3. Let Cloud Run's service account read the secrets"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for s in "$SECRET_MONGO" "$SECRET_JWT"; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$RUN_SA" --role="roles/secretmanager.secretAccessor" >/dev/null
done

echo "=== 4. Cloud Run: server (port 8000)"
# No CORS_ORIGINS needed: client and API are on the same domain (same origin).
gcloud run deploy "$SERVER_SVC" \
  --image="docker.io/$DOCKERHUB_USER/focusflow-backend:latest" \
  --region="$REGION" --port=8000 \
  --min-instances="$MIN_INSTANCES" --max-instances="$MAX_INSTANCES" \
  --memory=512Mi --cpu=1 \
  --set-env-vars="ENVIRONMENT=production,MONGODB_DB_NAME=focusflow,ATTENTION_SIMULATION_MODE=false" \
  --set-secrets="MONGODB_URL=$SECRET_MONGO:latest,JWT_SECRET=$SECRET_JWT:latest" \
  --ingress=internal-and-cloud-load-balancing \
  --allow-unauthenticated

echo "=== 5. Cloud Run: client (port 3000)"
gcloud run deploy "$CLIENT_SVC" \
  --image="docker.io/$DOCKERHUB_USER/focusflow-frontend:latest" \
  --region="$REGION" --port=3000 \
  --min-instances="$MIN_INSTANCES" --max-instances="$MAX_INSTANCES" \
  --memory=256Mi --cpu=1 \
  --ingress=internal-and-cloud-load-balancing \
  --allow-unauthenticated

echo "=== 6. Load Balancer"
# 6.1 Static global IP
exists gcloud compute addresses describe focusflow-ip --global || \
  gcloud compute addresses create focusflow-ip --global --ip-version=IPV4
LB_IP=$(gcloud compute addresses describe focusflow-ip --global --format='value(address)')

# 6.2 Serverless NEG per Cloud Run service (same region as the service)
for svc in "$CLIENT_SVC" "$SERVER_SVC"; do
  exists gcloud compute network-endpoint-groups describe "$svc-neg" --region="$REGION" || \
    gcloud compute network-endpoint-groups create "$svc-neg" \
      --region="$REGION" --network-endpoint-type=serverless --cloud-run-service="$svc"
done

# 6.3 Backend service per NEG (serverless NEGs have no health checks)
for svc in "$CLIENT_SVC" "$SERVER_SVC"; do
  if ! exists gcloud compute backend-services describe "$svc-backend" --global; then
    gcloud compute backend-services create "$svc-backend" --global \
      --load-balancing-scheme=EXTERNAL_MANAGED
    gcloud compute backend-services add-backend "$svc-backend" --global \
      --network-endpoint-group="$svc-neg" --network-endpoint-group-region="$REGION"
  fi
done

# 6.4 URL map: default -> client, /api/* and /health -> server
if ! exists gcloud compute url-maps describe focusflow-urlmap; then
  gcloud compute url-maps create focusflow-urlmap --default-service="$CLIENT_SVC-backend"
  gcloud compute url-maps add-path-matcher focusflow-urlmap \
    --path-matcher-name=focusflow-paths \
    --default-service="$CLIENT_SVC-backend" \
    --path-rules="/api/*=$SERVER_SVC-backend,/health=$SERVER_SVC-backend" \
    --new-hosts="*"
fi

# 6.5 Google-managed SSL certificate for the domain
exists gcloud compute ssl-certificates describe focusflow-cert --global || \
  gcloud compute ssl-certificates create focusflow-cert --global --domains="$DOMAIN"

# 6.6 HTTPS proxy + forwarding rule on 443
exists gcloud compute target-https-proxies describe focusflow-https-proxy || \
  gcloud compute target-https-proxies create focusflow-https-proxy \
    --url-map=focusflow-urlmap --ssl-certificates=focusflow-cert
exists gcloud compute forwarding-rules describe focusflow-https-rule --global || \
  gcloud compute forwarding-rules create focusflow-https-rule --global \
    --load-balancing-scheme=EXTERNAL_MANAGED --address=focusflow-ip \
    --target-https-proxy=focusflow-https-proxy --ports=443

# 6.7 (extra) http:// -> https:// redirect on port 80
if ! exists gcloud compute url-maps describe focusflow-http-redirect; then
  cat > /tmp/focusflow-redirect.yaml <<EOF
name: focusflow-http-redirect
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
EOF
  gcloud compute url-maps import focusflow-http-redirect --global \
    --source=/tmp/focusflow-redirect.yaml --quiet
fi
exists gcloud compute target-http-proxies describe focusflow-http-proxy || \
  gcloud compute target-http-proxies create focusflow-http-proxy --url-map=focusflow-http-redirect
exists gcloud compute forwarding-rules describe focusflow-http-rule --global || \
  gcloud compute forwarding-rules create focusflow-http-rule --global \
    --load-balancing-scheme=EXTERNAL_MANAGED --address=focusflow-ip \
    --target-http-proxy=focusflow-http-proxy --ports=80

echo
echo "=================================================================="
echo " Load Balancer IP:  $LB_IP"
echo " NEXT: at your domain provider (No-IP), set an A record:"
echo "       $DOMAIN  ->  $LB_IP   (this IP only)"
echo " Then wait for the certificate (can take up to 60 min):"
echo "   gcloud compute ssl-certificates describe focusflow-cert --global --format='value(managed.status)'"
echo " When it says ACTIVE, open:  https://$DOMAIN/health"
echo "=================================================================="
