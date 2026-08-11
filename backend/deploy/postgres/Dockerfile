FROM postgres:16-alpine

# Custom entrypoint: copy TLS material with postgres-safe permissions, then start.
COPY docker-entrypoint-wrap.sh /usr/local/bin/docker-entrypoint-wrap.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-wrap.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint-wrap.sh"]
CMD ["postgres"]
