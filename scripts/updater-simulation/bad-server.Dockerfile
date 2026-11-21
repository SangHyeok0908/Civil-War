# 시작하면 sim_bad 표를 만든 뒤 실패하는 모의 서버. compose.yml과 같은 고정 postgres 이미지를 쓴다.
FROM postgres:18.6@sha256:1267c7e692de235fda2a50dbcdbcbca4672ea6a0298576a6bd9d07cafc319b32
ARG SIM_SLEEP=0
ARG SIM_LABEL=bad
LABEL sim.label=$SIM_LABEL
ENV SIM_SLEEP=$SIM_SLEEP
ENTRYPOINT ["sh", "-c", "PGPASSWORD=\"$DATABASE_PASSWORD\" psql -h postgres -U \"$DATABASE_USER\" -d cw_collector_acceptance -c 'CREATE TABLE IF NOT EXISTS sim_bad (id int)' && sleep \"${SIM_SLEEP:-0}\"; exit 1"]
