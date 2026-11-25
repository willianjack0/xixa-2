FROM nginx:alpine
COPY . /usr/share/nginx/html
# versão publicada (o deployer passa os --build-arg; sem eles o rodapé não mostra a tarja)
ARG BUILD_BRANCH=
ARG BUILD_SHA=
ARG BUILD_PR=
ARG BUILD_AT=
RUN mv /usr/share/nginx/html/deploy/nginx.conf /etc/nginx/conf.d/default.conf \
 && rm -rf /usr/share/nginx/html/deploy \
 && if [ -n "$BUILD_SHA" ]; then printf '{"ramo":"%s","sha":"%s","pr":"%s","em":"%s"}\n' "$BUILD_BRANCH" "$BUILD_SHA" "$BUILD_PR" "$BUILD_AT" > /usr/share/nginx/html/versao.json; fi
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
