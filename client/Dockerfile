#FROM nodesource/trusty:0.10
FROM ubuntu:xenial

COPY . .
RUN echo Installing packages;apt-get -qq update && apt-get -qq -y install \
	autoconf \
	automake \
	autotools-dev \
	bison \
	build-essential \
	curl \
	flex \
	git \
	libfdt-dev \
	libglib2.0 \
	libpixman-1-dev \
	libssl-dev \
	libtool \
	pkg-config \
	postgresql-client \
	python-crypto \
	python-defusedxml \
	python-pip \
	python-requests \
	unzip \
	zlib1g \
	zlib1g-dev

#build qemu
RUN pip install pip --upgrade
RUN pip install requests --upgrade
RUN make
	
CMD ["python","worker.py","http://traceapi:8000/]
