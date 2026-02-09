-- 채팅 첨부파일 삭제: 메시지 삭제 시 Storage에서도 제거 가능하도록
create policy "chat-media delete"
  on storage.objects for delete to public
  using (bucket_id = 'chat-media');
