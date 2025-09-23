from rest_framework import serializers
from .models import Resume, Job,Shortlist
from .models import Application

class ResumeUploadSerializer(serializers.ModelSerializer):
    # show user username and file url in response
    user = serializers.SerializerMethodField(read_only=True)
    file = serializers.FileField(required=True)

    class Meta:
        model = Resume
        fields = ['id', 'user', 'file', 'skills', 'experience', 'uploaded_at']
        read_only_fields = ['id', 'user', 'uploaded_at']

    def get_user(self, obj):
        return obj.user.username if obj.user else None

    def create(self, validated_data):
        # if we are saving via API view we set user in view, but keep fallback
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            validated_data['user'] = request.user
        return super().create(validated_data)

class JobSerializer(serializers.ModelSerializer):
    created_by = serializers.ReadOnlyField(source='created_by.username')

    class Meta:
        model = Job
        fields = ['id', 'title', 'description', 'skills_required',
                  'company', 'experience_required', 'location',
                  'posted_at', 'created_by']
        read_only_fields = ['id', 'created_by', 'posted_at']




class ShortlistSerializer(serializers.ModelSerializer):
    shortlisted_by = serializers.SerializerMethodField()
    job = serializers.PrimaryKeyRelatedField(read_only=True)
    resume = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Shortlist
        fields = ['id','job','resume','shortlisted_by','created_at','email_sent','email_sent_at']
        read_only_fields = ['id','shortlisted_by','created_at','email_sent','email_sent_at']

    def get_shortlisted_by(self, obj):
        return obj.shortlisted_by.username if obj.shortlisted_by else None
    
    





class ApplicationSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source='job.title', read_only=True)
    resume_file = serializers.SerializerMethodField()
    candidate_name = serializers.CharField(source='candidate.username', read_only=True)

    class Meta:
        model = Application
        fields = ('id','job','job_title','resume','resume_file','candidate','candidate_name',
                  'status','applied_at','score_snapshot','message')

    def get_resume_file(self, obj):
        if getattr(obj.resume, 'file', None):
            request = self.context.get('request')
            try:
                return request.build_absolute_uri(obj.resume.file.url) if request else obj.resume.file.url
            except Exception:
                return obj.resume.file.url
        return ''



