"""XML → normalized rows. One generic parser + field-alias tables: the M0 spike showed
27/32 chains share one schema and the rest only rename fields (docs/m0-reachability.md)."""

from .prices import PriceFile, PriceRow, parse_price_file
from .stores import StoreRow, parse_stores_file

__all__ = ["PriceFile", "PriceRow", "parse_price_file", "StoreRow", "parse_stores_file"]
