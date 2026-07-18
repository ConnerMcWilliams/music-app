def defuse_spreadsheet_formula(value: str) -> str:
    """Neutralize cells that Excel/Sheets would evaluate as formulas."""
    if value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{value}"
    return value
