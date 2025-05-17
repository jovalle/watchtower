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
  direnv \
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

# Install latest version of Sops
SOPS_VERSION=$(curl -s https://api.github.com/repos/getsops/sops/releases/latest | jq -r .tag_name)
curl -LO https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.linux.amd64
mv sops-${SOPS_VERSION}.linux.amd64 /usr/local/bin/sops
chmod +x /usr/local/bin/sops
