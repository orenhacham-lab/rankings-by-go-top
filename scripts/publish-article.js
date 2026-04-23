#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Read .env.local file manually
const envPath = path.join(__dirname, '../.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim()
  }
})

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase environment variables')
  console.error('supabaseUrl:', supabaseUrl ? 'found' : 'missing')
  console.error('serviceRoleKey:', serviceRoleKey ? 'found' : 'missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const articleData = {
  title: 'בדיקת מיקומים בגוגל – איך לדעת באמת איפה האתר שלכם נמצא',
  slug: 'checking-positions-google',
  excerpt: 'בדיקת מיקומים בגוגל היא הדרך להבין את המציאות. לא מה חושבים, אלא מה קורה בפועל.',
  content: fs.readFileSync('/tmp/article_content.txt', 'utf-8'),
  meta_description: 'בדיקת מיקומים בגוגל – איך לעקוב אחרי ביטויים, להבין מגמות ולשפר קידום בצורה מדויקת וחכמה',
  featured_image_url: null,
  featured_image_alt: 'בדיקת מיקומים בגוגל',
  author: 'Go Top',
  is_published: true,
  published_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
}

async function publishArticle() {
  try {
    console.log('Publishing article...')
    const { data, error } = await supabase
      .from('articles')
      .insert([articleData])

    if (error) {
      console.error('Error publishing article:', error)
      process.exit(1)
    }

    console.log('✓ Article published successfully!')
    console.log('Article ID:', data[0]?.id)
  } catch (error) {
    console.error('Unexpected error:', error)
    process.exit(1)
  }
}

publishArticle()
