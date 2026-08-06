FROM mcr.microsoft.com/devcontainers/javascript-node:20

# --- Java (necessário para o Gradle/Android) ---
# Usamos "default-jdk" em vez de uma versão fixa (ex: openjdk-17-jdk)
# porque o nome exato do pacote muda entre versões do Debian.
RUN apt-get update && \
    apt-get install -y default-jdk unzip && \
    rm -rf /var/lib/apt/lists/*

# Deteta o JAVA_HOME real e grava para persistir em todas as shells do container
RUN JAVA_HOME_DETECTED=$(dirname $(dirname $(readlink -f $(which java)))) && \
    echo "JAVA_HOME=$JAVA_HOME_DETECTED" >> /etc/environment && \
    echo "export JAVA_HOME=$JAVA_HOME_DETECTED" >> /etc/bash.bashrc

# --- Android SDK (command-line tools apenas — o Gradle trata do resto) ---
ENV ANDROID_HOME=/home/node/android-sdk
ENV ANDROID_SDK_ROOT=$ANDROID_HOME
ENV PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

USER node

RUN mkdir -p $ANDROID_HOME/cmdline-tools && \
    cd $ANDROID_HOME/cmdline-tools && \
    curl -o cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip && \
    unzip -q cmdline-tools.zip && \
    rm cmdline-tools.zip && \
    mv cmdline-tools latest

# Aceita as licenças e instala os componentes mínimos para Capacitor
RUN yes | sdkmanager --licenses > /dev/null 2>&1 || true && \
    sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" > /dev/null 2>&1
