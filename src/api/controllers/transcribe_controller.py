from flask import jsonify, request, make_response, abort
from src.services.transcribe_service import *
from src.utils.constants import *
import yt_dlp
from pydub import AudioSegment

def is_audio_longer_than_5_minutes(file_path):
    audio = AudioSegment.from_file(file_path)

    duration_minutes = len(audio) / 60000

    return duration_minutes > 5

def transcribe():
    try:
        if 'file' in request.files:
            file = request.files['file']
            if file.filename == '':
                return jsonify({"error": "No selected file"}), 400

            job_name = request.form['jobName']
            object_key = file.filename
            file_object = file.stream

            try:
                S3_CLIENT.upload_fileobj(file_object, BUCKET_NAME, file.filename)
                start_transcription_job(BUCKET_NAME, object_key, job_name)

                try:
                    result = get_transcription_job_result(job_name)
                    return result
                except Exception as e:
                    return make_response(jsonify({'error': f"Exception encountered while retrieving transcript. error: {str(e)}"}))

            except Exception as e:
                return make_response(jsonify({'error': f"Exception encountered while uploading MP3 to S3 and starting job." f"error: {str(e)}"}))

        elif 'inputUrlRef' in request.form.keys():
            input_url = request.form['inputUrlRef']
            job_name = request.form['jobName']
            object_key = input_url + ".mp3"
            url = YOUTUBE_URL_BASE + input_url
            try:
                ydl_opts = {
                    'format': 'mp3/bestaudio/best',
                    'outtmpl' : f'{DOWNLOADS_FOLDER}/%(id)s.%(ext)s' ,
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                    }]
                }

                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        status_code = ydl.download([url])
                except Exception as e:
                    abort(400)
                    return make_response(jsonify({'error': f"Exception encountered." f"error: {str(e)}"}))

                print(status_code)

                print(f"{DOWNLOADS_FOLDER}/{input_url}.mp3")

                if is_audio_longer_than_5_minutes(f"{DOWNLOADS_FOLDER}/{input_url}.mp3") :
                    print("longer than 5 mins")
                    abort(400)
                else:
                    print("not longer than 5 mins")

                try:
                    with open(f"{DOWNLOADS_FOLDER}/{input_url}.mp3", "rb") as f:
                        print('f FOR YOUTUBE: ', f)
                        S3_CLIENT.upload_fileobj(f, BUCKET_NAME, object_key)
                    start_transcription_job(BUCKET_NAME, object_key, job_name)

                    try:
                        result = get_transcription_job_result(job_name)
                        return result
                    except Exception as e:
                        abort(400)

                except Exception as e:
                    return make_response(jsonify({'error': f"Exception encountered while uploading MP3 to S3 and starting job." f"error: {str(e)}"}))

            except Exception as e:
                return jsonify({"error": f"Exception encountered while converting YT to MP3."
                                         f"Please check the video URL or your network connection."
                                         f"error: {str(e)}"})
        else:
            return make_response(jsonify({"error": "No file found"}), 500)

    except Exception as e:
        return make_response(jsonify({"error": str(e)}), 500)