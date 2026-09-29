import json
import sys
from pathlib import Path

import openpyxl


DIFFICULTY = {
    "简单": "Easy",
    "中等": "Medium",
    "困难": "Hard",
}


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build-huawei-questions.py <source.xlsx> <output.js>")

    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    sheet = workbook["华为216题清单"]
    questions = []

    for row in sheet.iter_rows(min_row=5, values_only=True):
        if not row[1]:
            continue
        difficulty = DIFFICULTY.get(str(row[4]).strip())
        if not difficulty:
            raise ValueError(f"unknown difficulty for problem {row[1]}: {row[4]}")
        questions.append([
            str(row[1]).strip(),
            str(row[2]).strip(),
            difficulty,
            int(row[5]),
            round(float(row[3]), 6),
        ])

    ids = [question[0] for question in questions]
    if len(questions) != 216 or len(set(ids)) != len(ids):
        raise ValueError(f"expected 216 unique questions, got {len(questions)} rows / {len(set(ids))} unique ids")

    payload = json.dumps(questions, ensure_ascii=False, separators=(",", ":"))
    output.write_text(
        "// Generated from 华为_LeetCode_216题_截图完整整理.xlsx.\n"
        f"window.HUAWEI_QUESTIONS = {payload};\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(questions)} Huawei questions to {output}")


if __name__ == "__main__":
    main()
