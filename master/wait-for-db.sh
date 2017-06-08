#!/bin/bash

start_ts=$(date +%s)
while :
do
	(echo > /dev/tcp/db/5432) >/dev/null 2>&1
	result=$?
	if [[ $result -eq 0 ]]; then
		end_ts=$(date +%s)
		echo "$cmdname: db is available after $((end_ts - start_ts)) seconds"
		break
	fi
	echo DB not live yet.
	sleep 3
done

while :
do
	/usr/bin/node master.js
	echo Restarting master server.
done
