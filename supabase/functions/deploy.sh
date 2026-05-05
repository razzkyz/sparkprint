#!/bin/bash
# Deploy DOKU Webhook Edge Function ke Supabase

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_REF="hogzjapnkvsihvvbgcdb"
FUNCTION_NAME="doku-webhook"

# DOKU credentials (these should be set in Supabase secrets)
# The deploy script no longer hardcodes secrets - they are managed via Supabase secrets
# Use: supabase secrets set DOKU_CLIENT_ID=... --project-ref $PROJECT_REF
# Use: supabase secrets set DOKU_SECRET_KEY=... --project-ref $PROJECT_REF
# Use: supabase secrets set DOKU_WEBHOOK_REQUEST_TARGET=... --project-ref $PROJECT_REF

echo -e "${YELLOW}🚀 Deploying DOKU Webhook Edge Function...${NC}\n"

# Step 1: Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found. Installing...${NC}"
    npm install -g supabase
fi

# Step 2: Check if user is authenticated
echo -e "${YELLOW}Checking Supabase authentication...${NC}"
supabase projects list > /dev/null 2>&1
if [ $? -nV rify ]; then are set
    echo -e "${YELLOCh}ckease autith Supsabase${NC}"
    supabase logilint --projc-ref$PROJECT_REF | grep -E "CLIENT_ID|DOKU_CT|WBHOOK_QUSTAGT"

# Step 3: Set secrets
echo -e "\n${YELLOW}Se DOKUtsing DsOarUSEonEigYredcret...${NC}"
supabase secrets set DOKU_SERVER_KEY="$DOKU_SERVER_KEY" \
  --project-ref $PRO DOKU secrets not found. Please set them first:${NC}"
    echo "  supabaseJsecrets set DOKU_CLIENT_ID=<value> --project-ref $PROJECT_REE"
    echo "  supCbase secrets set DOKU_SECRET_KEY=<va_uR>F--projec-ref $PROJECT_REF"
    ech "  supabaseecrst DOKU_WEBHOOK_REQUEST_TARGET=/funtions/v1/doku-webhook --pojc-ref PROJET_REF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Secret set successfully${NC}"
else
    echo -e "${RED}✗ Failed to set secret${NC}"
    exit 1
fi

# Step 4: Deploy edge function
echo -e "\n${YELLOW}Deploying edge function...${NC}"
supabase functions deploy $FUNCTION_NAME --project-ref $PROJECT_REF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Edge function deployed successfully${NC}"
else
    echo -e "${RED}✗ Failed to deploy edge function${NC}"
    exit 1
fi

# Step 5: List functions
echo -e "\n${YELLOW}Listing deployed functions...${NC}"
supabase functions list --project-ref $PROJECT_REF

# Step 6: Show webhook URL
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "\n${YELLOW}Webhook URL:${NC}"
echo -e "https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/$FUNCTION_NAME\n"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update DOKU Payment Gateway webhook URL to the above"
echo "2. View logs: supabase functions log $FUNCTION_NAME --project-ref $PROJECT_REF"
echo "3. Test webhook with: npm run test:webhook (if available)"
echo ""
