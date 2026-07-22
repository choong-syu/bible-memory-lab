"""Report noun candidates that deserve manual review."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


# Common one-syllable nouns that are meaningful blank-answer candidates.
EXPECTED_SINGLE_NOUNS = set(
    "때 말 일 주 집 손 죄 날 후 배 앞 곳 안 떡 길 속 옷 땅 전 왕 선 위 물 돌 의 "
    "눈 악 종 명 불 뜻 몸 산 못 귀 딸 빛 뒤 해 상 밖 새 힘 원 문 곁 발 영 양 잔 "
    "끝 피 병 풀 떼 돈 닭 욕 글 씨 장 목 옥 개 혀 입 금 흠 점 덕 본 흙 싹 절 밤 "
    "책 형 젖 검 뜰 꽃 띠 품 낫 알 춤 뭍 맛 짝 즙 틀 밭 달 별 칼 뱀 독 표 술 값 "
    "낮 삯 샘".split()
)


def main() -> None:
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    suspicious = []
    counts = Counter()
    for book in data["books"]:
        for chapter in book["chapters"]:
            for verse in chapter["verses"]:
                for noun in verse["nouns"]:
                    surface = noun["surface"]
                    if len(surface) == 1 and surface not in EXPECTED_SINGLE_NOUNS:
                        counts[surface] += 1
                        suspicious.append(
                            f"{book['bookCode']} {chapter['chapter']}:{verse['verse']} "
                            f"[{surface}] {verse['text']}"
                        )
    print("Suspicious one-character noun counts:", dict(counts.most_common()))
    print("\n".join(suspicious))


if __name__ == "__main__":
    main()
