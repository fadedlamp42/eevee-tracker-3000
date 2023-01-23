#!/bin/sh
sudo cp ./eevee-tracker.service /etc/systemd/system/ -v

echo "enabling service on startup"
sudo systemctl enable eevee-tracker.service

echo "starting service"
sudo systemctl start eevee-tracker.service
