"""Small dependency-free XLSX export for sanitized contract gift plans."""

from decimal import Decimal
from io import BytesIO
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile

from src.modules.contract_workspace.schemas import GiftLineRead

_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
ET.register_namespace("", _MAIN_NS)
ET.register_namespace("r", _REL_NS)


def gift_plan_xlsx(contract_number: str, gifts: list[GiftLineRead]) -> bytes:
    """Build an XLSX sheet without exporting recipient contact or audit data."""
    headers = [
        "Gift ID", "Recipient ID", "Occasion/Event", "Gift", "Customisation", "Quantity",
        "Unit Price", "Line Total", "Delivery Date", "Status", "Vendor",
    ]
    rows: list[list[object]] = [["Contract Number", contract_number], [], headers]
    for gift in gifts:
        rows.append([
            gift.id,
            gift.recipient_id,
            gift.event_name or gift.occasion_name or gift.event_id or gift.occasion_id,
            gift.gift_name,
            gift.customisation or "",
            gift.quantity,
            gift.unit_price,
            gift.line_total,
            gift.delivery_date.isoformat() if gift.delivery_date else "",
            gift.status.value,
            gift.vendor_name or "",
        ])

    sheet_data = ET.Element(f"{{{_MAIN_NS}}}worksheet")
    data_node = ET.SubElement(sheet_data, f"{{{_MAIN_NS}}}sheetData")
    for row_index, values in enumerate(rows, start=1):
        row_node = ET.SubElement(data_node, f"{{{_MAIN_NS}}}row", {"r": str(row_index)})
        for column_index, value in enumerate(values, start=1):
            cell_ref = f"{_column_name(column_index)}{row_index}"
            cell = ET.SubElement(row_node, f"{{{_MAIN_NS}}}c", {"r": cell_ref})
            if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
                cell.set("t", "n")
                ET.SubElement(cell, f"{{{_MAIN_NS}}}v").text = str(value)
            else:
                cell.set("t", "inlineStr")
                inline = ET.SubElement(cell, f"{{{_MAIN_NS}}}is")
                ET.SubElement(inline, f"{{{_MAIN_NS}}}t", {"{http://www.w3.org/XML/1998/namespace}space": "preserve"}).text = str(value)

    workbook = ET.Element(f"{{{_MAIN_NS}}}workbook")
    sheets = ET.SubElement(workbook, f"{{{_MAIN_NS}}}sheets")
    ET.SubElement(
        sheets,
        f"{{{_MAIN_NS}}}sheet",
        {"name": "Gift Plan", "sheetId": "1", f"{{{_REL_NS}}}id": "rId1"},
    )
    workbook_rels = ET.Element("{http://schemas.openxmlformats.org/package/2006/relationships}Relationships")
    ET.SubElement(
        workbook_rels,
        "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship",
        {
            "Id": "rId1",
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
            "Target": "worksheets/sheet1.xml",
        },
    )
    root_rels = ET.Element("{http://schemas.openxmlformats.org/package/2006/relationships}Relationships")
    ET.SubElement(
        root_rels,
        "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship",
        {
            "Id": "rId1",
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
            "Target": "xl/workbook.xml",
        },
    )
    content_types = ET.Element("{http://schemas.openxmlformats.org/package/2006/content-types}Types")
    ET.SubElement(
        content_types,
        "{http://schemas.openxmlformats.org/package/2006/content-types}Default",
        {"Extension": "rels", "ContentType": "application/vnd.openxmlformats-package.relationships+xml"},
    )
    ET.SubElement(
        content_types,
        "{http://schemas.openxmlformats.org/package/2006/content-types}Default",
        {"Extension": "xml", "ContentType": "application/xml"},
    )
    ET.SubElement(
        content_types,
        "{http://schemas.openxmlformats.org/package/2006/content-types}Override",
        {"PartName": "/xl/workbook.xml", "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"},
    )
    ET.SubElement(
        content_types,
        "{http://schemas.openxmlformats.org/package/2006/content-types}Override",
        {"PartName": "/xl/worksheets/sheet1.xml", "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"},
    )

    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as xlsx:
        xlsx.writestr("[Content_Types].xml", ET.tostring(content_types, encoding="utf-8", xml_declaration=True))
        xlsx.writestr("_rels/.rels", ET.tostring(root_rels, encoding="utf-8", xml_declaration=True))
        xlsx.writestr("xl/workbook.xml", ET.tostring(workbook, encoding="utf-8", xml_declaration=True))
        xlsx.writestr("xl/_rels/workbook.xml.rels", ET.tostring(workbook_rels, encoding="utf-8", xml_declaration=True))
        xlsx.writestr("xl/worksheets/sheet1.xml", ET.tostring(sheet_data, encoding="utf-8", xml_declaration=True))
    return output.getvalue()


def _column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name
