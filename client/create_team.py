#!/usr/bin/env python
import trace_api
import sys
import json

def create_team(url, team_name):
	api = trace_api.TraceAPI(url)
	return api.post("team", {"name": team_name})

if __name__ == "__main__":
	if len(sys.argv) < 3:
		print "Expected API URL and team name"
		exit(1)

	result = create_team(sys.argv[1], sys.argv[2])
	print json.dumps(result)

