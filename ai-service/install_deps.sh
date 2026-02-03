#!/bin/bash
# Install Python dependencies for AI Service

echo "Installing Python dependencies for AI Service..."

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies from pyproject.toml
echo "Installing dependencies..."
pip install -e .

# Install development dependencies
echo "Installing development dependencies..."
pip install -e ".[dev]"

echo "Installation complete!"
echo ""
echo "To activate virtual environment:"
echo "  source venv/bin/activate"
echo ""
echo "To run the AI service:"
echo "  python -m ai_service.main"
echo ""
echo "To run tests:"
echo "  pytest"