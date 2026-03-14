# 현장 사진 폴더 매핑 작업

## 목적
- `resource 3966`, `resource 4274` 아래의 현장 사진 폴더를 목록화한다.
- 폴더 단위로 `consultation_id`, `space_id`, `space_display_name`을 매핑한다.
- 사진 분석은 매핑 완료 후 진행한다.

## 결과물
- 스크립트: `scripts/exportPhotoFolderMappingCandidates.ts`
- CSV 템플릿: `data/photo-folder-mapping.template.csv`
- 생성 CSV 기본 경로: `data/photo-folder-mapping.csv`

## 실행
```bash
npx tsx scripts/exportPhotoFolderMappingCandidates.ts \
  --root "/path/to/resource 3966" \
  --root "/path/to/resource 4274"
```

또는

```bash
PHOTO_ROOTS="/path/to/resource 3966:/path/to/resource 4274" \
npx tsx scripts/exportPhotoFolderMappingCandidates.ts
```

## CSV 컬럼
- `source_root`: 어떤 resource 루트에서 왔는지
- `folder_name`: 현장 사진 폴더명
- `folder_path`: 실제 폴더 경로
- `file_count`: 폴더 내부 이미지 수
- `sample_file`: 샘플 이미지 1개
- `consultation_id`: 연결할 상담 ID
- `space_id`: 연결할 스페이스 ID
- `space_display_name`: 사람이 보는 현장명
- `site_name`: 업로드 시 사용할 현장명
- `mapping_status`: 기본값 `pending`, 확정 후 `matched`, 제외 시 `ignored`
- `note`: 메모

## 작업 원칙
- `폴더 1개 = 현장 1개`
- 이미지가 실제로 있는 폴더만 대상으로 삼는다.
- 스페이스 전체를 강제로 다 맞추지 않는다.
- `consultation_id` 또는 `space_id`가 확정된 폴더만 다음 단계로 넘긴다.

## 다음 단계
1. CSV를 채운다.
2. `mapping_status=matched`인 행만 업로드/동기화 대상으로 사용한다.
3. 업로드 후 `대표 이미지`, `상담컷`, `숨김 후보` 분석을 진행한다.
