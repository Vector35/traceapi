#!/usr/bin/env python
import trace_api
import sys
import json

if len(sys.argv) < 3:
	print "Expected API URL and round number"
	exit(1)

api = trace_api.TraceAPI(sys.argv[1])

result = api.post("complete/%d" % int(sys.argv[2]), {})
print json.dumps(result)
