FROM ubuntu:trusty

#
# Install apt packages needed by the buildchain
#
ENV LANG C.UTF-8
COPY buildbot_worker_packages.list arsenal_packages.list /tmp/
RUN add-apt-repository ppa:ubuntu-toolchain-r/test \
    && apt-get update -q \
    && apt-get -qy install curl apt-transport-https \
    && apt-get install -qy software-properties-common python-software-properties \
    && git clone https://github.com/tj/n.git \
    && make -C ./n \
    && n 8 latest \
    && curl -sS http://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
    && echo "deb http://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
    && apt-get update \
    && cat /tmp/buildbot_worker_packages.list | xargs apt-get install -qy \
    && cat /tmp/arsenal_packages.list | xargs apt-get install -qy \
    && pip install pip==9.0.1 \
    && rm -rf ./n \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /tmp/*_packages.list

#
# Install usefull nodejs dependencies
#

RUN npm install mocha -g

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


WORKDIR /home/eve/workspace
CMD buildbot-worker create-worker . "$BUILDMASTER:$BUILDMASTER_PORT" "$WORKERNAME" "$WORKERPASS" \
    && sudo service redis-server start \
    && buildbot-worker start --nodaemon
