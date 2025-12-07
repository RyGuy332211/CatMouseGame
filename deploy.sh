#!/bin/bash
cd /home/$(whoami)/game
git pull origin main
npm install
sudo systemctl restart catmouse
