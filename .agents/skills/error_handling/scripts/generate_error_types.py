#!/usr/bin/env python3
"""
Generate error class boilerplate for the application's error hierarchy.

Usage:
    python generate_error_types.py --name PaymentFailed --code PAYMENT_FAILED --status 402
    python generate_error_types.py --name SessionExpired --code SESSION_EXPIRED --status 401 --details
    python generate_error_types.py --name InvalidToken --code INVALID_TOKEN --status 401 --output ./my_errors.py

The script generates Python class definitions that follow the project's error handling
patterns and can append them directly to your exceptions file.
"""

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


# Template for error class generation
ERROR_CLASS_TEMPLATE = '''class {class_name}(AppError):
    """{status_code} - {description}."""
    def __init__(self, message: str = "{default_message}"{extra_params}):
        super().__init__(message, "{error_code}", {status_code}{extra_args})
'''


# Common error patterns for descriptions and defaults
ERROR_PATTERNS = {
    "Validation": ("Invalid input data", "Validation failed"),
    "Auth": ("Authentication/authorization issue", "Authentication failed"),
    "NotFound": ("Resource not found", "Resource not found"),
    "Conflict": ("Resource conflict", "Resource conflict detected"),
    "RateLimit": ("Rate limit exceeded", "Too many requests"),
    "External": ("External service failure", "Service temporarily unavailable"),
    "Internal": ("Internal server error", "An unexpected error occurred"),
}


def guess_description(class_name: str, default: str) -> tuple[str, str]:
    """Guess description and default message from class name."""
    lower = class_name.lower()
    
    for pattern, (desc, msg) in ERROR_PATTERNS.items():
        if pattern.lower() in lower:
            return desc, msg
    
    # Fallback: convert CamelCase to readable description
    words = re.sub(r'(?<!^)(?=[A-Z])', ' ', class_name).lower()
    return default, words.capitalize()


def to_snake_case(name: str) -> str:
    """Convert CamelCase to snake_case."""
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def generate_error_class(
    class_name: str,
    error_code: str,
    status_code: int,
    include_details: bool = False,
    description: Optional[str] = None,
    default_message: Optional[str] = None
) -> str:
    """Generate error class code."""
    
    # Guess description and message if not provided
    if description is None or default_message is None:
        guessed_desc, guessed_msg = guess_description(class_name, description or "")
        description = description or guessed_desc
        default_message = default_message or guessed_msg
    
    # Build parameters
    extra_params = ""
    extra_args = ""
    
    if include_details:
        extra_params = ", details: Optional[Dict[str, Any]] = None"
        extra_args = ", details"
    
    return ERROR_CLASS_TEMPLATE.format(
        class_name=class_name,
        status_code=status_code,
        description=description,
        default_message=default_message,
        error_code=error_code,
        extra_params=extra_params,
        extra_args=extra_args
    )


def append_to_file(file_path: Path, class_code: str, dry_run: bool = False) -> None:
    """Append generated code to a file."""
    
    if dry_run:
        print(f"\n# Would append to: {file_path}\n")
        print(class_code)
        return
    
    # Ensure file exists
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Read existing content
    if file_path.exists():
        existing = file_path.read_text()
        # Check if class already exists
        class_name = class_code.split('(')[0].replace('class ', '').strip()
        if f"class {class_name}(" in existing:
            print(f"Error: Class '{class_name}' already exists in {file_path}")
            sys.exit(1)
    else:
        existing = ""
    
    # Add separator if file has content
    if existing and not existing.endswith('\n\n'):
        existing = existing.rstrip() + '\n\n'
    elif existing and not existing.endswith('\n'):
        existing += '\n'
    
    # Add timestamp comment
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    class_with_comment = f"# Generated: {timestamp}\n{class_code}"
    
    # Write back
    file_path.write_text(existing + class_with_comment)
    print(f"[OK] Appended to {file_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate error class boilerplate for the application",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic error class
  python generate_error_types.py --name PaymentFailed --code PAYMENT_FAILED --status 402
  
  # With details support
  python generate_error_types.py --name ValidationError --code VALIDATION_ERROR --status 400 --details
  
  # Custom output file
  python generate_error_types.py --name TokenExpired --code TOKEN_EXPIRED --status 401 --output ./custom_exceptions.py
  
  # Dry run (print only, don't write)
  python generate_error_types.py --name RateLimit --code RATE_LIMIT --status 429 --dry-run
        """
    )
    
    parser.add_argument(
        '--name', '-n',
        required=True,
        help='Class name (CamelCase, e.g., PaymentFailed)'
    )
    parser.add_argument(
        '--code', '-c',
        required=True,
        help='Error code (UPPER_SNAKE_CASE, e.g., PAYMENT_FAILED)'
    )
    parser.add_argument(
        '--status', '-s',
        type=int,
        required=True,
        help='HTTP status code (e.g., 400, 401, 404, 500)'
    )
    parser.add_argument(
        '--details', '-d',
        action='store_true',
        help='Include details parameter in constructor'
    )
    parser.add_argument(
        '--description',
        help='Custom description for docstring (auto-generated if not provided)'
    )
    parser.add_argument(
        '--message', '-m',
        help='Default error message (auto-generated if not provided)'
    )
    parser.add_argument(
        '--output', '-o',
        type=Path,
        default=Path('backend/app/core/exceptions.py'),
        help='Output file path (default: backend/app/core/exceptions.py)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Print generated code without writing to file'
    )
    parser.add_argument(
        '--stdout',
        action='store_true',
        help='Print generated code to stdout (ignores --output)'
    )
    
    args = parser.parse_args()
    
    # Validate inputs
    if not re.match(r'^[A-Z][a-zA-Z0-9]*$', args.name):
        print(f"Error: Class name '{args.name}' must be CamelCase")
        sys.exit(1)
    
    if not re.match(r'^[A-Z][A-Z0-9_]*$', args.code):
        print(f"Error: Error code '{args.code}' must be UPPER_SNAKE_CASE")
        sys.exit(1)
    
    if not 100 <= args.status <= 599:
        print(f"Error: HTTP status {args.status} is not valid")
        sys.exit(1)
    
    # Generate code
    class_code = generate_error_class(
        class_name=args.name,
        error_code=args.code,
        status_code=args.status,
        include_details=args.details,
        description=args.description,
        default_message=args.message
    )
    
    # Output handling
    if args.stdout or args.dry_run:
        print(class_code)
    else:
        append_to_file(args.output, class_code, dry_run=args.dry_run)
        print("\nGenerated code:")
        print("-" * 40)
        print(class_code)


if __name__ == '__main__':
    main()
