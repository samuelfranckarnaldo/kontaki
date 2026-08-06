#!/usr/bin/env bash
set -e

echo "== A instalar dependências do projeto =="
npm install

echo "== A instalar Capacitor =="
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android

# Só inicializa se ainda não houver capacitor.config
if [ ! -f capacitor.config.json ] && [ ! -f capacitor.config.ts ]; then
  echo "== A inicializar o Capacitor (primeira vez) =="
  npx cap init "Kontaki" "com.introxeer.kontaki" --web-dir="."
fi

# Só adiciona a plataforma Android se ainda não existir
if [ ! -d "android" ]; then
  echo "== A adicionar a plataforma Android =="
  npx cap add android
fi

npx cap sync android
echo "== Ambiente pronto =="
echo "Build debug:   cd android && ./gradlew assembleDebug"
echo "Build release: cd android && ./gradlew assembleRelease"
