---
layout: page
title: Raspberry Pi
---

All Raspberry Pi models work great with ENiGMA½! Keep in mind compiling the dependencies with
``$npm install` will take some time and *may* appear to hang. It's still working - just be patient and let it
complete.

### Basic Instructions

1. Download [Raspbian Stretch Lite](https://downloads.raspberrypi.org/raspbian_lite/images/raspbian_lite-2018-06-29/2018-06-27-raspbian-stretch-lite.zip). Install using [Etcher](https://www.balena.io/etcher/) to an SD card, or you can on Debian or Ubuntu use the following command in terminal `sudo apt install rpi-imager` to install as well.

2. Using the headless method
    1. On the boot partions add the following files:
    2. Create an empty file on the boot partition called `SSH`
    3. Create a file called `wpa_supplicant.conf` and add the below lines to this file.

``

    country=US
    ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
    update_config=1
    
    network={
       ssid="your_real_wifi_ssid"
       scan_ssid=1
        psk="your_real_password"
        key_mgmt=WPA-PSK
    }
``

3. SSH into your RPI using username "pi" and password "raspberry"

`$ssh pi@<ip address>`

4. In the terminal/command line please type `passwrd` and/to change your password.

5. Run `$sudo raspi-config`, then:
    1. Set your timezone (option 4, option I2)
    2. If you did are not using a headless setup please Enable SSH (option 5, option P2)
    3. Expand the filesystem to use the entire SD card (option 7, option A1)
    4. Click finish and your RPI should reboot

6. SSH back into RPI using username `pi` and password `newpassword`

`$ssh pi@<ip address>`

7. Now we will update the system
``

    $sudo apt-get update && sudo apt-get upgrade -y
    $sudo apt install lrzsz p7zip-full curl wget git make gcc g++ unzip unrar curl
    $sudo apt install libimage-exiftool-perl xdms unlzx
``

   
8. Next we will add some dependencies

``

    $curl -sL https://deb.nodesource.com/setup_10.x | sudo bash -
    $sudo apt install nodejs
    $node --version
    $curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
    $nvm --version
    $nvm install node
    $node --version
    $nvm install --lts
    $nvm ls
    $nvm use 12.22.6
``

    
9. Lastly will we will run the install script.

``

    $curl -o- https://raw.githubusercontent.com/NuSkooler/enigma-bbs/master/misc/install.sh | bash
    $cd /home/pi/enigma-bbs
    $./oputil.js config new
    
    ? Create a new configuration? (y/N) y
    ? Create a new configuration? Yes
    ? Configuration path: (./config/config.hjson)
    ? Configuration path: ./config/config.hjson
    ? BBS name: <new name of BBS>
    ? BBS name: <new name of BBS>
    ? First message conference: (Local)
    ? First message conference: Local
    ? Conference description: (Local Areas)
    ? Conference description: Local Areas
    ? First area in message conference: (General)
    ? First area in message conference: General
    ? Area description: (General chit-chat)
    ? Area description: General chit-chat
    ? Logging level: (Use arrow keys)
    ? Logging level: Info
    Configuration generated

``

    
10. Lastly we will run the BBS.

``

    pi@raspberrypi:~/enigma-bbs $ ls
    art     core    docs    LICENSE.TXT  misc        mods          oputil.js     package-lock.json  UPGRADE.md  WHATSNEW.md  yarn.lock
    config  docker  gopher  main.js      mkdocs.yml  node_modules  package.json  README.md          util        www
    pi@raspberrypi:~/enigma-bbs $ ./main.js
    ENiGMA½ Copyright (c) 2015-2021, Bryan D. Ashby
    _____________________   _____  ____________________    __________\_   /
    \__   ____/\_ ____   \ /____/ /   _____ __         \  /   ______/ // /___jp!
    //   __|___//   |    \//   |//   |    \//  |  |    \//        \ /___   /_____
    /____       _____|      __________       ___|__|      ____|     \   /  _____  \
    ---- \______\ -- |______\ ------ /______/ ---- |______\ - |______\ /__/ // ___/
    /__   _\
    <*>   ENiGMA½  // HTTPS://GITHUB.COM/NUSKOOLER/ENIGMA-BBS   <*>       /__/
    
    -------------------------------------------------------------------------------
    
    System started!
``

    
11. Profit!

