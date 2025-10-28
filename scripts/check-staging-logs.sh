#!/bin/bash
# Check Railway staging logs for admin/auth issues

echo "🔍 Checking Railway Staging Logs..."
echo ""
echo "Looking for admin authentication issues..."
echo "========================================"

# Check for admin-related errors
railway logs --environment staging --lines 200 | grep -i -E "admin|unauthorized|401|authentication|requireAdmin" --color=always

echo ""
echo "Looking for API errors..."
echo "========================"

# Check for API errors
railway logs --environment staging --lines 200 | grep -i -E "error|fail|exception|500|cors" --color=always

echo ""
echo "💡 To view full logs, run:"
echo "   railway logs --environment staging"
echo ""
echo "💡 To follow logs in real-time:"
echo "   railway logs --environment staging --follow"
