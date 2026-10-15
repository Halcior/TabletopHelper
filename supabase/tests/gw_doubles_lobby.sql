-- Regression: run in a transaction; all data and test objects roll back.
-- Exercises the live trigger with a four-seat GW Doubles setup,
-- invalid four-seat FFA setup, and legacy two-seat Duel.
begin;
create temp table _doubles_lobby_probe (
  id uuid,
  started_at timestamptz,
  session_snapshot jsonb,
  updated_at timestamptz
);
create trigger _doubles_lobby_probe_start
before update of started_at on _doubles_lobby_probe
for each row execute function public.enforce_shared_lobby_start();
do $test$
declare valid_doubles jsonb; message text;
begin
  valid_doubles := jsonb_build_object('setup', jsonb_build_object(
    'players', jsonb_build_array(jsonb_build_object('id','a'),jsonb_build_object('id','b'),jsonb_build_object('id','c'),jsonb_build_object('id','d')),
    'turnOrder', jsonb_build_array('a','c'),
    'doubles', jsonb_build_object('rulesVersion','GW-Doubles-1.0','forces',jsonb_build_array(
      jsonb_build_object('captainPlayerId','a','memberPlayerIds',jsonb_build_array('a','b')),
      jsonb_build_object('captainPlayerId','c','memberPlayerIds',jsonb_build_array('c','d'))
    ))
  ));
  insert into _doubles_lobby_probe values ('00000000-0000-0000-0000-000000000001',null,valid_doubles,null);
  begin
    update _doubles_lobby_probe set started_at=now() where id='00000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: valid Doubles bypassed online readiness';
  exception when check_violation then
    get stacked diagnostics message = message_text;
    if position('All 4 distinct' in message)=0 then raise exception 'Unexpected Doubles error: %',message; end if;
  end;
  insert into _doubles_lobby_probe values ('00000000-0000-0000-0000-000000000002',null,valid_doubles #- '{setup,doubles}',null);
  begin
    update _doubles_lobby_probe set started_at=now() where id='00000000-0000-0000-0000-000000000002';
    raise exception 'FAILED: invalid four-seat lobby passed';
  exception when check_violation then
    get stacked diagnostics message=message_text;
    if position('Four seats require' in message)=0 then raise exception 'Unexpected invalid Doubles error: %',message; end if;
  end;
  insert into _doubles_lobby_probe values ('00000000-0000-0000-0000-000000000003',null,
    jsonb_build_object('setup',jsonb_build_object('players',jsonb_build_array(jsonb_build_object('id','a'),jsonb_build_object('id','b')))),null);
  begin
    update _doubles_lobby_probe set started_at=now() where id='00000000-0000-0000-0000-000000000003';
    raise exception 'FAILED: old Duel bypassed readiness';
  exception when check_violation then
    get stacked diagnostics message=message_text;
    if position('All 2 distinct' in message)=0 then raise exception 'Old Duel lobby regressed: %',message; end if;
  end;
end;
$test$;
rollback;
