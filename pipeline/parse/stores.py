"""Parse Stores files."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .xmlio import leaf_dict, load_root


@dataclass(slots=True)
class StoreRow:
    chain_id: str
    chain_name: str
    sub_chain_id: str
    sub_chain_name: str
    store_id: str
    name: str
    address: str
    city: str  # CBS settlement code in some chains, Hebrew name in others
    store_type: str


def parse_stores_file(path: Path) -> list[StoreRow]:
    root = load_root(path)
    header = leaf_dict(root)
    chain_id, chain_name = header.get("chainid", ""), header.get("chainname", "")
    rows: list[StoreRow] = []
    for sub in (e for e in root.iter() if isinstance(e.tag, str) and e.tag.lower() == "subchain"):
        sd = leaf_dict(sub)
        # A store record is any element with a direct StoreId leaf: usually <Store>, but
        # City Market Shops wraps each one as <Store><SubChainStoreXMLObject>.
        for st in sub.iter():
            if not isinstance(st.tag, str):
                continue
            d = leaf_dict(st)
            if not d.get("storeid"):
                continue
            rows.append(
                StoreRow(
                    chain_id=d.get("chainid", chain_id),
                    chain_name=chain_name,
                    sub_chain_id=d.get("subchainid", sd.get("subchainid", "")),
                    sub_chain_name=sd.get("subchainname", ""),
                    store_id=d["storeid"],
                    name=d.get("storename", ""),
                    address=d.get("address", ""),
                    city=d.get("city", ""),
                    store_type=d.get("storetype", ""),
                )
            )
    return rows
