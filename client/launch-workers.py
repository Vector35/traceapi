#!/usr/bin/env python
import subprocess
import sys
import signal

def safekill(signum, frame):
	print "SIGINT received -- killing all workers."
	for worker in workers:
		worker.kill()
	sys.exit()

signal.signal(signal.SIGINT, safekill)

if len(sys.argv) < 3:
	print "Expected API URL and number of workers"
	exit(1)

count = int(sys.argv[2])

workers = []
for i in xrange(0, count):
	workers.append(subprocess.Popen(['./worker.py', sys.argv[1]] + sys.argv[3:]))

for worker in workers:
	worker.wait()
