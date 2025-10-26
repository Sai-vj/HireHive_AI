from django import forms
# import Resume from resumes app, not quiz.models
from resumes.models import Resume  

class ResumeForm(forms.ModelForm):
    class Meta:
        model = Resume
        fields = ['name', 'email', 'phone', 'file']
