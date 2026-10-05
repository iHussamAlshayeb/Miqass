FROM mongo:8.0

# السكربت قد يصل بنهايات أسطر ويندوز (CRLF)؛ نوحّدها قبل التشغيل
COPY backup-loop.sh /usr/local/bin/backup-loop.sh
RUN sed -i 's/\r$//' /usr/local/bin/backup-loop.sh && chmod +x /usr/local/bin/backup-loop.sh

ENTRYPOINT ["/usr/local/bin/backup-loop.sh"]
