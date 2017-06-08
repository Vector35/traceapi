HOST := $(shell uname)
PIE :=

ifeq ($(HOST),Darwin)
	PIE := --enable-pie
endif

.PHONY : all qemu-decree-fork/i386-decree-user/qemu-decree

all: qemu-decree qemu_cb_test.py qemu_cb_replay.py analysis.py print_analysis.py

qemu-decree: qemu-decree-fork/i386-decree-user/qemu-decree
	cp qemu-decree-fork/i386-decree-user/qemu-decree qemu-decree

qemu_cb_test.py: qemu-decree-fork/decree-user/qemu-cb-test
	cp qemu-decree-fork/decree-user/qemu-cb-test qemu_cb_test.py

qemu_cb_replay.py: qemu-decree-fork/decree-user/qemu_cb_replay.py
	cp qemu-decree-fork/decree-user/qemu_cb_replay.py qemu_cb_replay.py

analysis.py: qemu-decree-fork/decree-user/analysis.py
	cp qemu-decree-fork/decree-user/analysis.py analysis.py

print_analysis.py: qemu-decree-fork/decree-user/print-analysis.py
	cp qemu-decree-fork/decree-user/print-analysis.py print_analysis.py

qemu-decree-fork/i386-decree-user/qemu-decree: Makefile
	cd qemu-decree-fork && ./configure --target-list=i386-decree-user --disable-tools --disable-system $(PIE)
	cd qemu-decree-fork && make -j5

