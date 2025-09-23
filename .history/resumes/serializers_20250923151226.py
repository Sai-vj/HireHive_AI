from rest_framework import serializers
from .models import Resume, Job, Shortlist, Application


class JobNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = ('id', 'title', 'company', 'skills_required', 'experience_required')


class ResumeNestedSerializer(serializers.ModelSerializer):
    # include file url and basic metadata
    file_url = serializers.SerializerMethodField(read_only=True)
    file_name = serializers.SerializerMethodField(read_only=True)

    # NEW: candidate name (prefer full name -> username -> email -> fallback)
    candidate_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Resume
        fields = ('id', 'candidate_name', 'file_url', 'file_name', 'skills', 'experience', 'uploaded_at')

    def get_file_url(self, obj):
        if getattr(obj, 'file', None):
            request = self.context.get('request', None)
            try:
                return request.build_absolute_uri(obj.file.url) if request else obj.file.url
            except Exception:
                return getattr(obj.file, 'url', '')
        return ''

    def get_file_name(self, obj):
        if getattr(obj, 'file', None):
            try:
                return obj.file.name.split('/')[-1]
            except Exception:
                return getattr(obj.file, 'name', '')
        return ''

    def get_candidate_name(self, obj):
        # try Resume.candidate_name if exists
        if getattr(obj, 'candidate_name', None):
            return obj.candidate_name
        # try linked user
        user = getattr(obj, 'user', None)
        if user:
            # prefer full name, then username, then email
            full = ''
            if hasattr(user, 'get_full_name'):
                try:
                    full = user.get_full_name()
                except Exception:
                    full = ''
            if full:
                return full
            if getattr(user, 'username', None):
                return user.username
            if getattr(user, 'email', None):
                return user.email
        # try uploaded_by / owner fields
        if getattr(obj, 'uploaded_by', None):
            return str(obj.uploaded_by)
        # fallback
        return f"Resume {obj.pk}"


class ResumeUploadSerializer(serializers.ModelSerializer):
    # show user username and file url in response
    user = serializers.SerializerMethodField(read_only=True)
    file = serializers.FileField(required=True)
    file_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Resume
        fields = ['id', 'user', 'file', 'file_url', 'skills', 'experience', 'uploaded_at']
        read_only_fields = ['id', 'user', 'uploaded_at']

    def get_user(self, obj):
        return obj.user.username if obj.user else None

    def get_file_url(self, obj):
        if getattr(obj, 'file', None):
            request = self.context.get('request')
            try:
                return request.build_absolute_uri(obj.file.url) if request else obj.file.url
            except Exception:
                return obj.file.url
        return ''

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            validated_data['user'] = request.user
        return super().create(validated_data)


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = ['id', 'title', 'description', 'skills_required', 'company', 'experience_required']
        read_only_fields = ['id']

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class ShortlistSerializer(serializers.ModelSerializer):
    shortlisted_by = serializers.SerializerMethodField()
    job = serializers.PrimaryKeyRelatedField(read_only=True)

    # CHANGED: return nested resume object instead of just PK
    resume = ResumeNestedSerializer(read_only=True)

    class Meta:
        model = Shortlist
        fields = ['id', 'job', 'resume', 'shortlisted_by', 'created_at', 'email_sent', 'email_sent_at']
        read_only_fields = ['id', 'shortlisted_by', 'created_at', 'email_sent', 'email_sent_at']

    def get_shortlisted_by(self, obj):
        return obj.shortlisted_by.username if obj.shortlisted_by else None


class ApplicationSerializer(serializers.ModelSerializer):
    # nested job and resume for frontend convenience
    job = JobNestedSerializer(read_only=True)
    resume = ResumeNestedSerializer(read_only=True)

    # convenience fields
    job_title = serializers.CharField(source='job.title', read_only=True)
    job_company = serializers.CharField(source='job.company', read_only=True)
    resume_file = serializers.SerializerMethodField(read_only=True)
    candidate_username = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Application
        fields = (
            'id',
            'job',               # nested job object
            'job_title',
            'job_company',
            'resume',            # nested resume object
            'resume_file',
            'candidate_username',
            'status',
            'applied_at',
            'message',
            'score_snapshot',
        )
        read_only_fields = ('id', 'job', 'resume', 'applied_at', 'candidate_username')

    def get_resume_file(self, obj):
        if getattr(obj, 'resume', None) and getattr(obj.resume, 'file', None):
            request = self.context.get('request')
            try:
                return request.build_absolute_uri(obj.resume.file.url) if request else obj.resume.file.url
            except Exception:
                return getattr(obj.resume.file, 'url', '')
        return ''

    def get_candidate_username(self, obj):
        cand = getattr(obj, 'candidate', None)
        if cand:
            return getattr(cand, 'username', None) or getattr(cand, 'email', None)
        if getattr(obj, 'resume', None) and getattr(obj.resume, 'user', None):
            return getattr(obj.resume.user, 'username', None) or getattr(obj.resume.user, 'email', None)
        return None
