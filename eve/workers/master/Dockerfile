FROM ubuntu:trusty

#
# Install apt packages needed by the buildchain
#
ENV LANG C.UTF-8
COPY buildbot_worker_packages.list arsenal_packages.list /tmp/
RUN apt-get update -q && apt-get -qy install curl apt-transport-https \
    && apt-get install -qy software-properties-common python-software-properties \
    && curl --silent https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add - \
    && echo "deb https://deb.nodesource.com/node_8.x trusty main" > /etc/apt/sources.list.d/nodesource.list \
    && add-apt-repository ppa:ubuntu-toolchain-r/test \
    && apt-get update -q \
    && cat /tmp/buildbot_worker_packages.list | xargs apt-get install -qy \
    && cat /tmp/arsenal_packages.list | xargs apt-get install -qy \
    && pip install pip==9.0.1 \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /tmp/*_packages.list

#
# Add user eve
#

RUN adduser -u 1042 --home /home/eve --disabled-password --gecos "" eve \
    && adduser eve sudo \
    && sed -ri 's/(%sudo.*)ALL$/\1NOPASSWD:ALL/' /etc/sudoers

#
# Run buildbot-worker on startup
#

ARG BUILDBOT_VERSION=0.9.12
RUN pip install yamllint
RUN pip install buildbot-worker==$BUILDBOT_VERSION

USER eve
ENV HOME /home/eve
#
# Setup nodejs environmnent
#

ENV CXX=g++-4.9
ENV LANG C.UTF-8


CMD buildbot-worker create-worker . "$BUILDMASTER:$BUILDMASTER_PORT" "$WORKERNAME" "$WORKERPASS" \
    && sudo service redis-server start \
    && buildbot-worker start --nodaemon
