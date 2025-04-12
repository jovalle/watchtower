#!/bin/bash

apt update

# apt upgrade -y

apt install -y \
	btop \
  ansible \
  apache2-utils \
  btop \
  ca-certificates \
  cifs-utils \
  curl \
  dnsutils \
  extrepo \
  fio \
  glances \
  htop \
  iftop \
  intel-gpu-tools \
  intel-media-va-driver \
  iotop \
  jq \
  libva2 \
  lm-sensors \
  mediainfo \
  ncdu \
  neofetch \
  net-tools \
  nfs-common \
  open-iscsi \
  psmisc \
  rsync \
  software-properties-common \
  sudo \
  vainfo \
  vim

apt autoremove -y
