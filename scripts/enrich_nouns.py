"""Add Korean noun metadata to the collected Bible verse JSON."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from kiwipiepy import Kiwi


NOUN_TAGS = {
    "NNG": "일반명사",
    "NNP": "고유명사",
}

# Kiwi's general-purpose dictionary does not contain a number of biblical names
# and terms. A high score makes the intended reading win over accidental parses
# such as 갈리/VV + ㄹ/ETM + 리/NNB.
BIBLICAL_TERMS = {
    # People and groups
    "가룟": "NNP", "가야바": "NNP", "구레네": "NNP", "니골라": "NNP",
    "다대오": "NNP", "디매오": "NNP", "루포": "NNP", "막달라": "NNP",
    "바디매오": "NNP", "바돌로매": "NNP", "바리새인": "NNG",
    "다윗": "NNP", "레위": "NNP", "모세": "NNP", "바울": "NNP",
    "베드로": "NNP", "빌라도": "NNP", "빌립": "NNP", "사탄": "NNP",
    "사두개인": "NNG", "살로메": "NNP", "세베대": "NNP", "시몬": "NNP",
    "실루아노": "NNP", "안드레": "NNP", "알렉산더": "NNP", "알패오": "NNP",
    "아브라함": "NNP", "아비아달": "NNP", "야고보": "NNP", "엘리야": "NNP",
    "예레미야": "NNP", "예수": "NNP", "요한": "NNP", "유다": "NNP",
    "이사야": "NNP", "헤로디아": "NNP", "헤롯": "NNP", "솔로몬": "NNP",
    # Places and peoples
    "가버나움": "NNP", "가이사랴": "NNP", "갈릴리": "NNP", "게네사렛": "NNP",
    "겟세마네": "NNP", "고라신": "NNP", "골고다": "NNP", "나사렛": "NNP",
    "달마누다": "NNP", "데가볼리": "NNP", "두로": "NNP", "로마": "NNP",
    "고모라": "NNP", "마게도냐": "NNP", "바벨론": "NNP", "베다니": "NNP",
    "벳바게": "NNP", "벳새다": "NNP",
    "빌립보": "NNP", "사마리아": "NNP", "소돔": "NNP", "시돈": "NNP",
    "아리마대": "NNP", "애굽": "NNP", "예루살렘": "NNP", "요단": "NNP",
    "여리고": "NNP", "유대": "NNP", "이스라엘": "NNP", "이달리야": "NNP",
    "헬라인": "NNG",
    # Biblical and religious vocabulary
    "그리스도": "NNP", "대제사장": "NNG", "등경": "NNG", "매질": "NNG",
    "몽치": "NNG", "보아너게": "NNP", "복음": "NNG", "산헤드린": "NNG",
    "생베": "NNG", "서기관": "NNG", "석청": "NNG", "성내": "NNG",
    "성령": "NNG", "세관": "NNG", "수로보니게": "NNP", "안식일": "NNG",
    "율법": "NNG", "이단": "NNG", "인자": "NNG", "쟁론": "NNG",
    "침례": "NNG", "혈루": "NNG", "혈루증": "NNG", "호산나": "NNG",
    "롯": "NNP",
}

# Longest phrases take precedence. These are semantic names whose internal space
# should remain in the answer shown to a user.
BIBLICAL_PHRASES = {
    "가이사랴 빌립보": "NNP",
    "막달라 마리아": "NNP",
    "아리마대 요셉": "NNP",
    "수로보니게 족속": "NNP",
    "침례 요한": "NNP",
    "가룟 유다": "NNP",
    "구레네 시몬": "NNP",
    "갈릴리 바다": "NNP",
    "감람 산": "NNP",
    "요단 강": "NNP",
}

# These are recurrent false positives caused by archaic endings and predicates.
# For example, 아시고 is sometimes analysed as 아/NNG + 이/VCP + 시/EP.
# They are excluded only when the extracted noun is exactly this one character.
EXCLUDED_SINGLE_NOUNS = {
    "아", "행", "벤", "드", "니", "사", "감", "찜", "남", "능", "우", "허",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path, help="Raw verse JSON")
    parser.add_argument("output", type=Path, help="Enriched output JSON")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    kiwi = Kiwi()
    for form, tag in BIBLICAL_TERMS.items():
        kiwi.add_user_word(form, tag, score=10.0)

    total_nouns = 0
    for book in data["books"]:
        for chapter in book["chapters"]:
            for verse in chapter["verses"]:
                nouns = []
                seen = set()
                candidates = []
                text = verse["text"]

                # Collect phrases first so their component words can be suppressed.
                phrase_nouns = []
                for phrase, tag in sorted(
                    BIBLICAL_PHRASES.items(), key=lambda item: len(item[0]), reverse=True
                ):
                    start = 0
                    while (start := text.find(phrase, start)) >= 0:
                        phrase_nouns.append(
                            {
                                "surface": phrase,
                                "lemma": phrase,
                                "pos": tag,
                                "posLabel": NOUN_TAGS[tag],
                                "start": start,
                                "length": len(phrase),
                                "source": "biblicalPhrase",
                            }
                        )
                        start += len(phrase)

                tokens = [t for t in kiwi.tokenize(text) if t.tag in NOUN_TAGS]
                token_nouns = []
                index = 0
                while index < len(tokens):
                    group = [tokens[index]]
                    index += 1
                    # Merge noun fragments only when they are contiguous in the
                    # original text. Thus 침/례 becomes 침례, but 요단 강 requires
                    # the explicit phrase rule above.
                    while index < len(tokens) and group[-1].start + group[-1].len == tokens[index].start:
                        group.append(tokens[index])
                        index += 1

                    start = group[0].start
                    end = group[-1].start + group[-1].len
                    tag = "NNP" if any(t.tag == "NNP" for t in group) else "NNG"
                    token_nouns.append(
                        {
                            "surface": text[start:end],
                            "lemma": "".join(t.form for t in group),
                            "pos": tag,
                            "posLabel": NOUN_TAGS[tag],
                            "start": start,
                            "length": end - start,
                            "source": "morphology",
                        }
                    )

                token_nouns = [
                    noun for noun in token_nouns
                    if noun["surface"] not in EXCLUDED_SINGLE_NOUNS
                ]

                def overlaps_phrase(noun: dict) -> bool:
                    noun_end = noun["start"] + noun["length"]
                    return any(
                        noun["start"] < p["start"] + p["length"] and p["start"] < noun_end
                        for p in phrase_nouns
                    )

                nouns = phrase_nouns + [n for n in token_nouns if not overlaps_phrase(n)]
                nouns.sort(key=lambda n: (n["start"], -n["length"]))

                for noun in nouns:
                    if noun["surface"] not in seen:
                        seen.add(noun["surface"])
                        candidates.append(noun["surface"])

                verse["nouns"] = nouns
                verse["nounCandidates"] = candidates
                total_nouns += len(nouns)

    data["schemaVersion"] = "1.2.0"
    data["nounAnalysis"] = {
        "engine": "Kiwi (kiwipiepy)",
        "includedPos": NOUN_TAGS,
        "policy": "성경 용어 사전을 우선 적용하고 일반명사(NNG)·고유명사(NNP)를 원문 등장 순서대로 포함; 붙어 있는 명사 조각과 지정된 복합 지명을 병합",
        "biblicalTerms": BIBLICAL_TERMS,
        "biblicalPhrases": BIBLICAL_PHRASES,
        "excludedSingleNounFalsePositives": sorted(EXCLUDED_SINGLE_NOUNS),
        "totalOccurrences": total_nouns,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
