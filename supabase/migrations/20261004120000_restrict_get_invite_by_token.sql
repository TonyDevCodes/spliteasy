-- get_invite_by_token is only called by signed-in users (web invite page and
-- mobile invite screen both require a session first), so anonymous callers
-- don't need to be able to look up invites by token.

revoke execute on function get_invite_by_token(text) from public, anon;
grant execute on function get_invite_by_token(text) to authenticated;
