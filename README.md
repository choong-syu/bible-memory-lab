# 성경 빈칸문제 데이터

재림마을 시조사채널 성경 페이지에서 다음 범위를 수집한 데이터입니다.

- 마가복음 1~16장
- 베드로전서 1~5장
- 베드로후서 1~3장
- 요한일서 1~3장

## 파일

- `data/bible-verses.raw.json`: 수집한 절 본문과 출처 정보
- `data/bible-verses.json`: 각 절에 명사 분석 정보를 추가한 최종 데이터
- `scripts/enrich_nouns.py`: 원문 JSON에 명사 정보를 추가하는 스크립트
- `scripts/validate_data.py`: 장 범위, 절 순서, 명사 위치를 검증하는 스크립트

각 절의 `nouns`에는 일반명사(`NNG`)와 고유명사(`NNP`)가 등장 순서대로 저장됩니다.
`start`와 `length`를 이용하면 원문에서 해당 명사를 정확히 빈칸으로 바꿀 수 있습니다.
`nounCandidates`는 같은 절 안에서 중복을 제거한 간단한 출제 후보 목록입니다.

일반 한국어 사전에서 잘못 분리되는 성경 인명·지명·종교 용어는
`scripts/enrich_nouns.py`의 `BIBLICAL_TERMS`에서 우선 처리합니다. `요단 강`,
`갈릴리 바다`, `가이사랴 빌립보`처럼 띄어쓰기를 포함한 이름은
`BIBLICAL_PHRASES`에서 하나의 명사 후보로 병합합니다. `source`가
`biblicalPhrase`이면 이 규칙으로 병합된 항목입니다.

`scripts/audit_nouns.py`는 사전에 예상하지 못한 한 글자 명사를 문맥과 함께 출력하여
추가 검토할 때 사용합니다.

## 다시 생성하기

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

.\.venv\Scripts\python.exe scripts\enrich_nouns.py `
  data\bible-verses.raw.json data\bible-verses.json

.\.venv\Scripts\python.exe scripts\validate_data.py data\bible-verses.json
```

본문 출처 URL은 각 장의 `sourceUrl`에 기록되어 있습니다. 사이트의 이용 조건과 성경 번역본의
저작권 범위는 실제 공개·배포 전에 별도로 확인해야 합니다.
