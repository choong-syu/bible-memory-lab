"""Validate chapter coverage, verse ordering, and noun offsets."""

from __future__ import annotations

import json
import sys
from pathlib import Path


EXPECTED = {"Mk": 16, "1Pe": 5, "2Pe": 3, "1Jn": 3}
REGRESSIONS = {
    ("Mk", 1, 9): {
        "required": {"갈릴리", "나사렛", "요단 강", "침례"},
        "forbidden": {"단", "강", "침", "례"},
    },
    ("Mk", 5, 25): {
        "required": {"혈루증"},
        "forbidden": {"혈", "증"},
    },
    ("Mk", 7, 26): {
        "required": {"수로보니게 족속"},
        "forbidden": {"수", "게"},
    },
}


def main() -> None:
    path = Path(sys.argv[1])
    data = json.loads(path.read_text(encoding="utf-8"))
    books = {book["bookCode"]: book for book in data["books"]}
    errors = []
    verse_count = 0
    noun_count = 0

    for code, chapter_count in EXPECTED.items():
        book = books.get(code)
        if book is None:
            errors.append(f"missing book: {code}")
            continue
        actual_chapters = [chapter["chapter"] for chapter in book["chapters"]]
        if actual_chapters != list(range(1, chapter_count + 1)):
            errors.append(f"invalid chapters for {code}: {actual_chapters}")

        for chapter in book["chapters"]:
            verses = chapter["verses"]
            numbers = [verse["verse"] for verse in verses]
            if numbers != list(range(1, len(verses) + 1)):
                errors.append(f"invalid verse order: {code} {chapter['chapter']}")
            verse_count += len(verses)
            for verse in verses:
                previous_end = -1
                for noun in verse.get("nouns", []):
                    extracted = verse["text"][noun["start"] : noun["start"] + noun["length"]]
                    if extracted != noun["surface"]:
                        errors.append(
                            f"invalid noun offset: {code} {chapter['chapter']}:{verse['verse']}"
                        )
                    if noun["start"] < previous_end:
                        errors.append(
                            f"overlapping/out-of-order nouns: {code} "
                            f"{chapter['chapter']}:{verse['verse']}"
                        )
                    previous_end = noun["start"] + noun["length"]
                    noun_count += 1

                expected_candidates = list(dict.fromkeys(n["surface"] for n in verse["nouns"]))
                if verse.get("nounCandidates") != expected_candidates:
                    errors.append(
                        f"invalid nounCandidates: {code} {chapter['chapter']}:{verse['verse']}"
                    )

                regression = REGRESSIONS.get((code, chapter["chapter"], verse["verse"]))
                if regression:
                    actual = set(verse["nounCandidates"])
                    missing = regression["required"] - actual
                    forbidden = regression["forbidden"] & actual
                    if missing or forbidden:
                        errors.append(
                            f"noun regression: {code} {chapter['chapter']}:{verse['verse']} "
                            f"missing={sorted(missing)} forbidden={sorted(forbidden)}"
                        )

    if errors:
        raise SystemExit("\n".join(errors))
    print(f"OK: {len(books)} books, {sum(EXPECTED.values())} chapters, "
          f"{verse_count} verses, {noun_count} noun occurrences")


if __name__ == "__main__":
    main()
