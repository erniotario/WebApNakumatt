#!/bin/bash -e
OS_DISTRO='trusty'
MIRROR='http://archive.ubuntu.com/ubuntu/'
CHROOT='/var/datastore/storekeeper-demo'

INSTALL_DIR='/usr/local/storekeeper'
EXT_INSTALL_DIR="${CHROOT}${INSTALL_DIR}"
PROD_USER='storekeeper'
PROD_GROUP='storekeeper'
PROD_USER_HOME='/var/run/storekeeper'

HOST='localhost'
PORT=8000
URL='/storekeeper'
CONFIG='DemoConfig'


function chr()
{
    chroot "${CHROOT}" "$@"
}

function run_as_root()
{
    chr su - root -c "$*"
}

function run_as_user()
{
    chr su - "${PROD_USER}" -c "$*"
}

function run_in_prod()
{
    run_as_user "cd ${INSTALL_DIR} && $*"
}

function prepare_chroot()
{
    if [ -e "${CHROOT}" ]
    then
        return
    fi

    echo ' * Preparing chroot...'
    mkdir -p "$(dirname "${CHROOT}")"
    debootstrap "${OS_DISTRO}" "${CHROOT}" "${MIRROR}"
}

function is_mounted()
{
    local directory="$1"

    mount | grep -q "on ${directory} type"
}

function mount_resource()
{
    local resource="$1"
    local directory="$2"

    if is_mounted "${directory}"
    then
        return
    fi

    mount "${resource}" "${directory}" -t "${resource}"
}

function unmount_resource()
{
    local directory="$1"

    if is_mounted "${directory}"
    then
        if umount "${directory}"
        then
            return
        fi
        umount -l "${directory}"
    fi
}

function mount_resources()
{
    echo ' * Mounting resources...'
    mount_resource 'proc' "${CHROOT}/proc"
    mount_resource 'sysfs' "${CHROOT}/sys"
}

function unmount_resources()
{
    echo ' * Un-mounting resources...'
    unmount_resource "${CHROOT}/proc"
    unmount_resource "${CHROOT}/sys"
}

function prepare_network()
{
    echo ' * Preparing network...'
    cp '/etc/hosts' "${CHROOT}/etc/hosts"
    cp '/etc/resolv.conf' "${CHROOT}/etc/resolv.conf"
}

function update_sources_list()
{
    local COMMENT="# Generated by $(basename "$0")"
    if grep -Fq "^${COMMENT}$" "${CHROOT}/etc/apt/sources.list"
    then
        return
    fi

    echo " * Updateing sources.list..."
    cat - <<EOF > "${CHROOT}/etc/apt/sources.list"
${COMMENT}
deb ${MIRROR} ${OS_DISTRO} main restricted universe multiverse
deb ${MIRROR} ${OS_DISTRO}-updates main restricted universe multiverse
#deb ${MIRROR} ${OS_DISTRO}-proposed main restricted universe multiverse
deb ${MIRROR} ${OS_DISTRO}-backports main restricted universe multiverse
deb ${MIRROR} ${OS_DISTRO}-security main restricted universe multiverse
#deb http://archive.canonical.com/ubuntu ${OS_DISTRO} partner
#deb http://extras.ubuntu.com/ubuntu ${OS_DISTRO} main
EOF
}

function prepare_uwsgi()
{
    UWSGI="${CHROOT}/etc/uwsgi"
    CONFIG="${UWSGI}/apps-available/storekeeper.ini"
    ENABLED_CONFIG="${UWSGI}/apps-enabled/storekeeper.ini"
    LINK_TARGET='../apps-available/storekeeper.ini'
    if [ -e "${ENABLED_CONFIG}" ]
    then
        return
    fi

    echo ' * Preparing uwsgi...'
    cat - <<EOF > "${CONFIG}"
[uwsgi]
# Who will run the code
uid = ${PROD_USER}
gid = ${PROD_GROUP}

# Number of workers
workers = 4

# The right granted on the created socket
chmod-socket = 666

# Plugin to use and interpreter config
single-interpreter = true
master = true
plugin = python3

# Module to import
module = run:app

# Virtualenv and python path
virtualenv = ${INSTALL_DIR}/server/flask
pythonpath = ${INSTALL_DIR}/server
chdir = ${INSTALL_DIR}/server
EOF
    ln -s "${LINK_TARGET}" "${ENABLED_CONFIG}"
}

function prepare_nginx()
{
    NGINX="${CHROOT}/etc/nginx"
    DEFAULT="${NGINX}/sites-enabled/default"
    STOREKEEPER="${NGINX}/sites-available/storekeeper"
    ENABLED_STOREKEEPER="${NGINX}/sites-enabled/storekeeper"
    LINK_TARGET='../sites-available/storekeeper'
    if [ -e "${ENABLED_STOREKEEPER}" ]
    then
        return
    fi

    echo ' * Preparing nginx...'
    if [ -e "${DEFAULT}" -o -L "${DEFAULT}" ]
    then
        rm "${DEFAULT}"
    fi
    cat - <<EOF > "${STOREKEEPER}"
server {
    listen ${PORT};
    server_name ${HOST};
    index index.html;
    deny all;

    location / {
        allow all;
        return 301 ${URL}/;
    }

    location ${URL}/ {
        allow all;
        alias ${INSTALL_DIR}/client/app/;
        try_files \$uri \$uri/ @storekeeper;
    }

    location @storekeeper {
        allow all;
        include uwsgi_params;
        uwsgi_pass unix:/run/uwsgi/app/storekeeper/socket;
    }
}
EOF
    ln -s "${LINK_TARGET}" "${ENABLED_STOREKEEPER}"
}

function prepare_users()
{
    if run_as_root id "${PROD_USER}" &>/dev/null
    then
        return
    fi

    echo ' * Preparing users...'
    run_as_root addgroup "${PROD_GROUP}" --system
    run_as_root adduser "${PROD_USER}" --system --ingroup "${PROD_GROUP}" --shell '/bin/bash' --home "${PROD_USER_HOME}"
    run_as_root adduser "${PROD_USER}" 'sudo'
}

function prepare_sudo()
{
    SUDOERS="${CHROOT}/etc/sudoers.d/storekeeper"
    if [ -e "${SUDOERS}" ]
    then
        return
    fi

    echo ' * Preparing sudoers...'
    cat - <<EOF > "${SUDOERS}"
storekeeper ALL=(ALL) NOPASSWD: ALL
EOF
    chmod 0440 "${SUDOERS}"
}

function clone_update_storekeeper_code()
{
    if [ ! -e "${EXT_INSTALL_DIR}/.git" ]
    then
        echo ' * Installing StoreKeeper...'
        mkdir -p "${EXT_INSTALL_DIR}"
        run_as_root chown "${PROD_USER}:${PROD_GROUP}" "${INSTALL_DIR}"
        run_as_user git clone 'https://github.com/andras-tim/StoreKeeper.git' "${INSTALL_DIR}"
    else
        echo ' * Cleanup and updating StoreKeeper...'
        run_in_prod git fetch origin --prune
        run_in_prod git reset --hard origin/master
        run_in_prod git clean -fd
    fi
}

function install_update_storekeeper()
{
    run_in_prod ./package.sh --production --force install

    if [ -e "${EXT_INSTALL_DIR}/server/db_repository" ]
    then
        return
    fi

    run_in_prod 'cd server && ./database.py --create'
}

function configure_storekeeper()
{
    local config_path="${EXT_INSTALL_DIR}/server/config.yml"
    if [ -e "${config_path}" ]
    then
        return
    fi

    echo ' * Configuring StoreKeeper...'
    cp "${EXT_INSTALL_DIR}/server/config.default.yml" "${config_path}"
    local new_secret="$(openssl rand -hex 16)"

    sed "s>^USED_CONFIG: .*$>USED_CONFIG: ${CONFIG}>" -i "${config_path}"
    sed "s>PleaseChangeThisImportantSecretString>${new_secret}>g" -i "${config_path}"
}

function restart_services()
{
    echo ' * (Re)starting services...'
    set +e
    run_as_root /etc/init.d/nginx stop
    run_as_root /etc/init.d/uwsgi stop
    set -e

    run_as_root /etc/init.d/uwsgi start
    run_as_root /etc/init.d/nginx start
}


######
# MAIN
#
if [ ! -e  "${CHROOT}/etc/debian_chroot" ]
then
    prepare_chroot
    mount_resources
    prepare_network

    update_sources_list
    run_as_root apt-get update
    run_as_root apt-get dist-upgrade -y
    run_as_root apt-get install -y language-pack-en-base language-pack-hu-base vim git nginx uwsgi uwsgi-plugin-python3

    prepare_uwsgi
    prepare_nginx

    prepare_users
    prepare_sudo
    echo 'storekeeper-demo' > "${CHROOT}/etc/debian_chroot"
fi

mount_resources
clone_update_storekeeper_code
install_update_storekeeper
configure_storekeeper
restart_services
