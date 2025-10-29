#!/bin/bash

# Railway Environment Variable Setup Script
# This script helps you configure the OpenAI API key in Railway

echo "========================================="
echo "Railway AI Configuration Helper"
echo "========================================="
echo ""
echo "To enable AI-assisted alert generation:"
echo ""
echo "1. Go to: https://railway.app"
echo "2. Select your CLG-ADMIN project"
echo "3. Click on 'Variables' tab"
echo "4. Click '+ New Variable'"
echo "5. Add the following:"
echo ""
echo "   Variable Name:  VITE_OPENAI_API_KEY"
echo "   Variable Value: [Your OpenAI API key]"
echo ""
echo "6. Railway will automatically redeploy"
echo ""
echo "========================================="
echo "Current Configuration:"
echo "========================================="
echo ""

if [ -f .env ]; then
    if grep -q "VITE_OPENAI_API_KEY" .env; then
        echo "✅ Local .env file has VITE_OPENAI_API_KEY configured"
        # Don't show the actual key for security
        echo "   Value: [HIDDEN]"
    else
        echo "❌ Local .env file missing VITE_OPENAI_API_KEY"
    fi
else
    echo "❌ No .env file found"
    echo ""
    echo "To create one:"
    echo "  cp .env.example .env"
    echo "  # Then edit .env and add your OpenAI key"
fi

echo ""
echo "========================================="
echo "Verification:"
echo "========================================="
echo ""
echo "After deploying to Railway with the API key:"
echo "1. Open your Railway admin panel URL"
echo "2. Go to News Feed"
echo "3. Click the Bell icon on any news article"
echo "4. Look for purple 'Generate Smart Alert with AI' button"
echo ""
echo "If you don't see the button, the API key is not configured."
echo ""
