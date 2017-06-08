# Trace-API

## Install Instructions

Here's the quick overview to get going with the minimum effort:

1. Install [docker](https://www.docker.com/community-edition) for [linux](https://docs.docker.com/engine/installation/linux/ubuntu/#install-docker), [osx](https://docs.docker.com/docker-for-mac/install/), or [windows](https://docs.docker.com/docker-for-windows/install/).
2. If linux, also install [docker-compose](https://github.com/docker/compose/releases) (docker-compose is installed by default on Windows and OS X).
3. Download this repository (either as a [zip](https://github.com/Vector35/traceapi/archive/master.zip), or using a `git clone https://github.com/Vector35/traceapi/`, whichever is easier.
4. Extract the `zip` or `cd` into the directory where it was cloned
5. Combine the SQL database (Linux/OS X: ```cat master/traceapi.sql.gz.? > master/traceapi.sql.gz``` or Windows: ```copy /b master\traceapi.sql.gz.? master\traceapi.sql.gz```)
5. Launch docker-compose: ```docker-compose build
docker-compose up``` 
6. Wait for all the initialization to finish. You should now have a traceapi instance running on port 8000 of the machine that ran these steps! Now, simply point your [Haxxis](https://github.com/voidALPHA/cgc_viz) configuration at this IP and port.

## Repository Structure

- `client/`: Worker code that generates instrumented trace files among other analysis
- `client/qemu-decree-fork`: Fork of [QEMU](http://www.qemu.org/) that adds taint tracking and understanding of [DECREE](http://repo.cybergrandchallenge.com/release-cfe/) syscalls
- `README.md`: this file
- `master/`: The nodejs server that acts as the API for [Haxxis](https://github.com/voidALPHA/cgc_viz) into game state, does job management for additional analytics and also allows interactively exploring results from CGC CFE.
- `master/store`: Cache of submitted binaries, IDS rules, POVs, and a small sample of polls for each service.
- `master/traceapi.sql.gz`: Preconfigured database dump with imported results from a complete run of the final event.

# License

[QEMU](http://wiki.qemu.org/License) is a fork of a GPLv2 product and is accordingly licensed under the [GPLv2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html). 
All other content not specifically listed with a given license is released under an [MIT](https://opensource.org/licenses/MIT) license.

