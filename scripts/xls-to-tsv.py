"""Convert the first sheet of a campaign-filing .xls export to TSV.

Usage: xls-to-tsv.py <in.xls> <out.tsv>
Header row as-is; date cells become ISO dates; integral numbers drop the ".0";
tabs and newlines inside cells become spaces.
"""

import sys

import xlrd


def cell_text(book, cell):
    if cell.ctype == xlrd.XL_CELL_DATE:
        y, m, d, hh, mm, ss = xlrd.xldate_as_tuple(cell.value, book.datemode)
        if (hh, mm, ss) == (0, 0, 0):
            return f"{y:04d}-{m:02d}-{d:02d}"
        return f"{y:04d}-{m:02d}-{d:02d}T{hh:02d}:{mm:02d}:{ss:02d}"
    if cell.ctype == xlrd.XL_CELL_NUMBER:
        v = cell.value
        return str(int(v)) if v == int(v) else repr(v)
    if cell.ctype == xlrd.XL_CELL_BOOLEAN:
        return "TRUE" if cell.value else "FALSE"
    if cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK, xlrd.XL_CELL_ERROR):
        return ""
    text = str(cell.value)
    for ch in ("\t", "\r", "\n"):
        text = text.replace(ch, " ")
    return text


def main(src, dst):
    book = xlrd.open_workbook(src)
    sheet = book.sheet_by_index(0)
    with open(dst, "w", encoding="utf-8", newline="") as out:
        for r in range(sheet.nrows):
            cells = [cell_text(book, c) for c in sheet.row(r)]
            out.write("\t".join(cells) + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: xls-to-tsv.py <in.xls> <out.tsv>")
    main(sys.argv[1], sys.argv[2])
