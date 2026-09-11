-- Data fixup for the Folder -> Category rename: the storage path template setting (key
-- "storage_path_template") is a user-editable string persisted in Setting.value, not code, so
-- the previous migration's identifier renames couldn't touch it. Any stored template still using
-- the old {folder} token needs to become {category} to keep matching
-- printService.ts's STORAGE_TEMPLATE_TOKENS -- otherwise every plate save fails validation with
-- "Unknown storage token: {folder}". A plain substring replace on the underlying text handles
-- both the exact default and any custom template that merely includes the token among others.
UPDATE "Setting"
SET value = to_jsonb(replace(value #>> '{}', '{folder}', '{category}'))
WHERE key = 'storage_path_template' AND (value #>> '{}') LIKE '%{folder}%';
