
from rest_framework import serializers
from .models import Resume, Job

class ResumeUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resume
        fields = ['id', 'file', 'skills', 'uploaded_at']
        read_only_fields = ['skills', 'uploaded_at']

class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = '__all__'
