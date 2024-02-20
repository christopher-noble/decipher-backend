"""
AWS transcription service logic for external API communications.
"""

import time
from flask import jsonify
from src.utils.constants import *
import json

# Start a transcription job
def start_transcription_job(bucket_name, object_key, job_name, language_code='en-US'):
    TRANSCRIBE_CLIENT.start_transcription_job(
        TranscriptionJobName=job_name,
        LanguageCode=language_code,
        MediaFormat='mp3',  # replace with your audio format
        Media={'MediaFileUri': f's3://{bucket_name}/{object_key}'},
        OutputBucketName=bucket_name  # specify the bucket for the transcription output
    )


# Download the json once the job is complete
def get_completed_transcript(bucket_name, object_key):
    response = S3_CLIENT.get_object(Bucket=bucket_name, Key=object_key)
    transcription_result = response['Body'].read().decode('utf-8')
    return transcription_result


# Get the result. Max 50 attempts (for now).
def get_transcription_job_result(job_name):
    attempts = 0
    while attempts < MAX_RETRIEVE_ATTEMPTS:
        job_status_result = TRANSCRIBE_CLIENT.get_transcription_job(TranscriptionJobName=job_name)
        if 'TranscriptionJob' in job_status_result:
            if job_status_result['TranscriptionJob']['TranscriptionJobStatus'] == 'COMPLETED':

                print("Job Complete!")
                object_key = f'{job_name}.json'
                transcription_result = get_completed_transcript(BUCKET_NAME, object_key)
                transcription_result_dict = json.loads(transcription_result)
                items = transcription_result_dict['results']['items']
                full_transcript = transcription_result_dict['results']['transcripts'][0]['transcript']

                keyword_timestamp_map = []
                for item in items:
                    keyword_timestamp_map.append({'keyword': item['alternatives'][0]['content'],
                                                  'timestamp': item['start_time'] if 'start_time' in item.keys()
                                                  else ''})

                return jsonify({'fullTranscript': full_transcript,
                                'transcriptTimestampMap': keyword_timestamp_map})

            elif job_status_result['TranscriptionJob']['TranscriptionJobStatus'] == 'FAILED':
                print("Job Failed.")
                return jsonify({'error': "Transcription Job Failed."}), 500

            else:
                print("Job found, AWS Status: " + job_status_result['TranscriptionJob']['TranscriptionJobStatus'])
                attempts += 1
                time.sleep(2)
        else:
            print("Unable to find transcription job")
            return jsonify({'error': 'Transcription job not found'})

    return jsonify({'error': 'Exceeded limit of retrieve transcription attempts.'})