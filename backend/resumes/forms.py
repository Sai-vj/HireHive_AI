from django import forms
from .models import Resume, Job



class ResumeForm(forms.ModelForm):
    class Meta:
        model = Resume
        fields = ['file']  # only file upload allow



class JobForm(forms.ModelForm):
    class Meta:
        model = Job
        fields = ['title', 'description', 'skills_required', 'company', 'location']
