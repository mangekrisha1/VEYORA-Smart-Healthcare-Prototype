#!/bin/bash

set -e

apt-get update

apt-get install -y \
  docker.io \
  unzip \
  curl \
  ca-certificates

systemctl enable docker
systemctl start docker

usermod -aG docker ubuntu

curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"

unzip -q /tmp/awscliv2.zip -d /tmp

/tmp/aws/install

rm -rf /tmp/aws /tmp/awscliv2.zip

systemctl restart docker