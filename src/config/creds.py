import boto3
from dotenv import load_dotenv
import os

load_dotenv()

def aws_creds(service):
    return boto3.client(
            service,
            aws_access_key_id=os.environ['AWS_ACCESS_KEY'],
            aws_secret_access_key=os.environ['AWS_SECRET_KEY'],
            region_name=os.environ['AWS_REGION']
        )