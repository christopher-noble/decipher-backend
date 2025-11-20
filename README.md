# Decipher - Backend

With Decipher, you can effortlessly pinpoint any segment in your favourite podcasts, audiobooks, or web content. Simply input your desired phrases, upload your file, or share a URL, and let Decipher take care of the rest. Our robust transcription service is designed to process audio content, delivering transcripts with precise timestamps for your specified keywords or phrases.

[deciphercontent.com](https://deciphercontent.com)

## Technical Workflow

1. User uploads audio or YouTube URL

- Direct files processed via Flask multipart upload
- YouTube URLs converted to MP3 using yt-dlp + FFmpeg
- Pre-processing & validation

2. Duration validation using pydub

- File upload to S3 storage
- AWS Transcribe job initiation

3. Trigger transcription job with audio file reference

- Configure job parameters (language, format, output location)
- Asynchronous processing

4. Custom polling mechanism monitors job status

- Retry logic handles variable processing times
- Result processing & delivery

5. Parse transcription JSON from S3

- Generate word-level timestamp mappings
- Return searchable transcript with precise time indexes

## Hosting & Delivery

- AWS EC2
- Gunicorn WSGI Server
- AWS CloudFront
- AWS Route 53
